import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireCatalogueAdministrator,catalogueError} from './catalogue-policy.js';
import {familyReviewVersion} from './family-mode.js';
import {newOwnerCredentials} from './owner-credentials.js';
import {hashPassword} from './security.js';
import {openOwnerPassword,sealOwnerPassword} from './credential-vault.js';

const resetInput=z.object({
  contentVersion:z.string().regex(/^[a-f0-9]{64}$/),
  user_id:z.string().trim().min(3,'User ID must be at least 3 characters.').max(32,'User ID cannot exceed 32 characters.').regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/,'User ID can only contain letters, numbers, dots, hyphens, and underscores.').optional(),
  password:z.string().min(6,'Password must be at least 6 characters.').max(128).optional(),
  must_change_password:z.boolean().optional(),
  generate_password:z.boolean().optional(),
}).strict();
export function ownerLoginAdminRouter(pool){
  const router=Router();
  router.use('/shops/:id/owner-credentials',async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    res.set('Pragma','no-cache');
    req.credentialAdmin=await requireCatalogueAdministrator(pool,req.account);
    next();
  });
  async function target(db,req,lock=false){
    const id=z.string().uuid().parse(req.params.id);
    const shop=(await db.query('SELECT * FROM shops WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
    if(!shop||shop.status==='deleted')throw catalogueError(404,'Shop not found.');
    if(shop.admin_managed&&shop.owner_id!==req.credentialAdmin.id&&shop.provisioned_by!==req.credentialAdmin.id){
      throw catalogueError(403,'This shop is not in your administrator-managed catalogue.');
    }
    const account=(await db.query('SELECT id,name,email,user_id,role,suspended,must_change_password,password_hash,owner_temporary_password FROM accounts WHERE id=$1'+(lock?' FOR UPDATE':''),[shop.owner_id])).rows[0];
    if(!account)throw catalogueError(404,'Shop owner not found.');
    const eligible=Boolean(shop.admin_managed&&shop.provisioned_by===req.credentialAdmin.id&&account.role==='merchant'&&account.user_id&&!account.suspended);
    return {shop,account,eligible};
  }
  async function details({shop,account,eligible}){
    const password=eligible?await openOwnerPassword(account):null;
    return {
      owner:{name:account.name,email:account.email,user_id:account.user_id||null,must_change_password:Boolean(account.must_change_password)},
      can_reset:eligible,family_review_version:familyReviewVersion(shop),
      credentials:password?{user_id:account.user_id,temporary_password:password}:null,
      ...(!password?{message:eligible
        ?(account.must_change_password?'The original temporary password is unavailable. Generate new login details to share with this owner.':'The owner has chosen a private password. Generate a new temporary password only if they need help signing in.')
        :'This shop has no administrator-created owner login to share.'}:{}),
    };
  }
  router.get('/shops/:id/owner-credentials',async(req,res)=>{
    res.json({success:true,data:await details(await target(pool,req))});
  });
  router.post('/shops/:id/owner-credentials',async(req,res)=>{
    const input=resetInput.parse(req.body),client=await pool.connect();
    let result;
    try{
      await client.query('BEGIN');
      await requireCatalogueAdministrator(client,req.account);
      const saved=await target(client,req,true),{shop,account,eligible}=saved;
      if(!eligible)throw catalogueError(403,'Only an administrator-created shop-owner account can receive temporary login details.');
      if(familyReviewVersion(shop)!==input.contentVersion)throw catalogueError(409,'The shop changed. Reopen its login details before generating a password.');

      let updatedUserId=account.user_id;
      if(input.user_id && input.user_id!==account.user_id){
        const conflict=(await client.query('SELECT 1 FROM accounts WHERE lower(user_id)=$1 AND id<>$2 LIMIT 1',[input.user_id.toLowerCase(),account.id])).rows[0];
        if(conflict)throw catalogueError(409,'This user ID is already in use. Choose a different user ID.');
        await client.query('UPDATE accounts SET user_id=$1 WHERE id=$2',[input.user_id,account.id]);
        updatedUserId=input.user_id;
      }

      let updatedHash=account.password_hash;
      let updatedEncrypted=account.owner_temporary_password;
      let updatedMustChange=account.must_change_password;
      let newPlainPassword=null;

      const shouldUpdatePassword=Boolean(input.password || input.generate_password || (!input.user_id && !input.password));
      if(shouldUpdatePassword){
        newPlainPassword=input.password || newOwnerCredentials().temporary_password;
        updatedHash=await hashPassword(newPlainPassword);
        updatedEncrypted=await sealOwnerPassword(newPlainPassword,account.id,updatedHash);
        updatedMustChange=true;
        await client.query('UPDATE accounts SET password_hash=$1,password_set=true,must_change_password=true,owner_temporary_password=$2 WHERE id=$3',[updatedHash,updatedEncrypted,account.id]);
        for(const table of ['sessions','web_handoffs','password_resets'])await client.query(`DELETE FROM ${table} WHERE account_id=$1`,[account.id]);
      }

      await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),req.account.id,'catalogue.owner.login.reset',shop.id]);
      const updatedAccount={...account,user_id:updatedUserId,must_change_password:updatedMustChange,password_hash:updatedHash,owner_temporary_password:updatedEncrypted};
      const detailsData=await details({...saved,account:updatedAccount});
      if(newPlainPassword){
        detailsData.credentials={user_id:updatedUserId,temporary_password:newPlainPassword};
      }
      result=detailsData;
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    res.json({success:true,data:result});
  });
  return router;
}
