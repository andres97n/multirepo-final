import { Controller, Get, Query } from '@nestjs/common';
import { UserListItem, UsersPage, UsersQuery } from '@repo/contracts/auth';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import type { Paginated } from '../../infra/database/core/query';
import type { User } from './auth.types';
import { Roles } from './roles.decorator';
import { UsersRepository } from './users.repository';

class UsersPageDto extends createZodDto(UsersPage) {}
class UsersQueryDto extends createZodDto(UsersQuery) {}

/**
 * `User` -> `UserListItem` (contract): copies only public fields —
 * passwordHash and lockout columns never leave the repository. `createdAt`
 * is omitted because the `User` entity carries no timestamps (see the M06
 * slice-2 result note; the contract marks it optional).
 */
function toUserListItem(user: User): UserListItem {
  return { id: user.id, email: user.email, roles: user.roles, status: user.status };
}

/**
 * Admin-only user listing: `GET /api/v1/users`. Pagination, sort and filter
 * come straight from the `UsersQuery` contract and are passed to the
 * repository port, which enforces the field whitelist (400 for others).
 * `@Roles('admin')` plus the global `RolesGuard` protect the controller;
 * `JwtAuthGuard` has already rejected anonymous callers with 401.
 */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  @Get()
  @ZodResponse({ status: 200, description: 'Paginated users', type: UsersPageDto })
  async list(@Query() query: UsersQueryDto): Promise<UsersPage> {
    const page: Paginated<User> = await this.users.list(
      { page: query.page, limit: query.limit, sort: query.sort },
      query.filter,
    );
    return {
      items: page.items.map(toUserListItem),
      page: page.page,
      limit: page.limit,
      total: page.total,
    };
  }
}
