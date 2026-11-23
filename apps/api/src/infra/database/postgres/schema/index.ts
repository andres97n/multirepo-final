// Application tables go here (M06+ adds auth tables). `db:generate` reads this barrel.
export { baseColumns } from './columns';

// @module:auth
// Auth tables live with the removable module; drizzle-kit only sees them while
// the marker region is present.
export { users } from '../../../../modules/auth/postgres/users.table';
export { sessions } from '../../../../modules/auth/postgres/sessions.table';
// @end-module:auth
