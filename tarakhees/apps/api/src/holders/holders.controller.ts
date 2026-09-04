import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  facilityInputSchema,
  personInputSchema,
} from '@repo/shared/licenses/license.schema';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parse } from '../common/zod.util';
import { HoldersService } from './holders.service';

const asBool = (v: unknown) => v === 'true' || v === true;

@Controller('facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacilitiesController {
  constructor(private readonly holders: HoldersService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.holders.listFacilities(asBool(includeInactive));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.holders.getFacility(id);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@Body() body: unknown) {
    return this.holders.createFacility(parse(facilityInputSchema, body));
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.holders.updateFacility(id, parse(facilityInputSchema.partial(), body));
  }

  @Delete(':id')
  @Roles('OWNER')
  deactivate(@Param('id') id: string) {
    return this.holders.deactivateFacility(id);
  }
}

@Controller('persons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PersonsController {
  constructor(private readonly holders: HoldersService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.holders.listPersons(asBool(includeInactive));
  }

  /** الرقم الكامل لا يراه VIEWER — القوائم تُقنَّع للجميع */
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const mayReveal = user.role === 'OWNER' || user.role === 'MANAGER';
    return this.holders.getPerson(id, mayReveal);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@Body() body: unknown) {
    return this.holders.createPerson(parse(personInputSchema, body));
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.holders.updatePerson(id, parse(personInputSchema.partial(), body));
  }

  @Delete(':id')
  @Roles('OWNER')
  deactivate(@Param('id') id: string) {
    return this.holders.deactivatePerson(id);
  }
}
