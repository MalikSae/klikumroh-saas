// Where the staff login goes after success: back to the deep link the auth guard came from (state.from),
// but only to a staff page inside /internal (never the login page itself or anything outside the portal).
// Pure module so it can be unit tested with node.

export interface FromLocation {
  pathname?: string;
  search?: string;
  hash?: string;
}

export const DEFAULT_STAFF_PAGE = '/internal/dashboard';

export const staffLoginTarget = (from: FromLocation | null | undefined): string => {
  const path = from?.pathname ?? '';
  if (!path.startsWith('/internal/') || path.startsWith('//') || path === '/internal/login' || path.startsWith('/internal/login/')) {
    return DEFAULT_STAFF_PAGE;
  }
  return `${path}${from?.search ?? ''}${from?.hash ?? ''}`;
};
