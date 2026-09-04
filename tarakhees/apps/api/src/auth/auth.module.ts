import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InvitationService } from './invitation.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SuperAdminService } from './super-admin.service';
import { TokenService } from './token.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    InvitationService,
    SuperAdminService,
    // مسجَّل عالميًا: كل مسار محروس افتراضيًا، والاستثناء بـ @Public().
    // العكس (الحراسة عند الطلب) يعني أن أي مسار جديد يُنسى يولد مفتوحًا.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, TokenService, SuperAdminService],
})
export class AuthModule {}
