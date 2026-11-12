const employmentCategories = new Set(['job', 'jobs', 'job services', 'vacancy', 'vacancies', 'recruitment', 'recruitment services', 'placement', 'placements', 'placement services', 'employment']);

export const isEmploymentCategory = value => employmentCategories.has(String(value || '').trim().toLowerCase());
export const isSupportedCategory = category => !isEmploymentCategory(category?.name ?? category)
  && !isEmploymentCategory(category?.module);
export const isSupportedListing = item => !!item && !isEmploymentCategory(item.kind) && !isEmploymentCategory(item.module)
  && isSupportedCategory(item.category);
export const isEmploymentFilter = params => ['category', 'kind', 'module'].some(key => isEmploymentCategory(params.get(key)));

export function isEmploymentLink(value) {
  if (!value) return false;
  try { return isEmploymentFilter(new URL(value, 'https://allinonetoday.com').searchParams); }
  catch { return false; }
}
