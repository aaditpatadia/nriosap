/** The menu's folded state lives in a cookie, so the server can draw it right the first time and nothing jumps after load. */
export const SIDEBAR_COOKIE = "ally_sidebar";
export const writeSidebarCookie = (collapsed: boolean) => {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
};
