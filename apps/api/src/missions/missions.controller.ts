import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { MissionsService } from "./missions.service";

@Controller("missions")
@UseGuards(AuthGuard, RolesGuard)
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.missions.list(req.auth!.companyId); }

  @Get(":id")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.missions.get(req.auth!.companyId, id); }

  @Post(":id/transition")
  @Roles("OWNER", "ADMIN", "MANAGER", "DRIVER")
  transition(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: { to?: string; proofId?: string }) {
    return this.missions.transition(req.auth!, id, body.to, body.proofId);
  }

  @Post(":id/payment")
  @Roles("OWNER", "ADMIN", "MANAGER", "DRIVER")
  payment(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: { collected?: number }) {
    return this.missions.collect(req.auth!, id, body.collected);
  }

  @Post(":id/gps")
  @Roles("OWNER", "ADMIN", "MANAGER", "DRIVER")
  gps(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: { latitude?: number; longitude?: number; recordedAt?: string }) {
    return this.missions.gps(req.auth!, id, body);
  }
}
