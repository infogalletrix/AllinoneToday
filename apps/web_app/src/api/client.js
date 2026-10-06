export const categories = [
  "Vehicles",
  "Property",
  "Jobs",
  "Groceries",
  "Electronics",
  "Mobiles",
  "Services",
  "Furniture",
];
export async function request(path, options = {}) {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const result = await response
    .json()
    .catch(() => ({ message: "The service is temporarily unavailable." }));
  if (!response.ok || !result.success)
    throw new Error(result.message || "Request failed.");
  return result.data;
}
export const post = (path, body) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
export function resolveImageUrl(path) {
  return path?.startsWith("assets/")
    ? "/" + path.slice(7)
    : path || "/images/h.png";
}
export const fetchCategories = () => request("/categories");
export function fetchListings(params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return request("/listings?" + q);
}
export const fetchListing = (id) => request("/listings/" + id);
export const fetchVehicleDetails = (id) => request("/vehicles/" + id);
export const fetchDealerships = () => request("/dealerships");
export const createListing = (body) => post("/listings", body);
export const sendInquiry = (body) => post("/conversations", body);
export async function uploadImage(file) {
  const body = new FormData();
  body.append("image", file);
  return (await request("/uploads", { method: "POST", body })).url;
}
