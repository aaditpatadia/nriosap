export const REQUEST_CATEGORIES = ["Property", "Government papers", "Bills and payments", "Repairs and errands", "Looking after someone", "Something else"] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];
