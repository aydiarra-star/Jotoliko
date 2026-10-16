import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { BillingAccessGuard } from "../billing/billing-access.guard";
import { RequirePermission, RolesGuard } from "../auth/roles.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { MissionsService } from "./missions.service";
import { AssignMissionDto } from "./dto/assign-mission.dto";
import { CollectPaymentDto } from "./dto/collect-payment.dto";
import { CreateMissionDto } from "./dto/create-mission.dto";
import { ListMissionsDto } from "./dto/list-missions.dto";
import { RecordGpsDto } from "./dto/record-gps.dto";
import { RemitCashDto } from "./dto/remit-cash.dto";
import { TransitionDto } from "./dto/transition.dto";

/**
 * Toutes les routes sont protégées par `AuthGuard` (jeton valide, compte actif,
 * rattachement vérifié) puis `RolesGuard` (matrice de permissions centrale).
 * Aucun contrôle d'accès n'est laissé à l'interface.
 */
@Controller("missions")
@UseGuards(AuthGuard, BillingAccessGuard, RolesGuard)
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListMissionsDto) {
    return this.missions.list(req.auth!, query);
  }

  @Get(":id")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.missions.get(req.auth!, id);
  }

  /**
   * Création d'une mission. `Idempotency-Key` est facultatif : une reprise hors
   * ligne qui rejoue la même création obtient la mission déjà créée plutôt
   * qu'une seconde mission.
   */
  @Post()
  @RequirePermission("createMission")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateMissionDto,
    @Headers("idempotency-key") key?: string
  ) {
    return this.missions.create(req.auth!, body, key, req.requestId);
  }

  @Post(":id/assignment")
  @RequirePermission("assignMission")
  assign(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: AssignMissionDto
  ) {
    return this.missions.assign(req.auth!, id, body, req.requestId);
  }

  @Post(":id/transition")
  @RequirePermission("transitionMission")
  transition(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: TransitionDto
  ) {
    return this.missions.transition(req.auth!, id, body, req.requestId);
  }

  @Post(":id/payment")
  @RequirePermission("collectPayment")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  payment(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CollectPaymentDto,
    @Headers("idempotency-key") key?: string
  ) {
    return this.missions.collect(req.auth!, id, body, key, req.requestId);
  }

  @Post(":id/remittance")
  @RequirePermission("remitCash")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  remittance(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: RemitCashDto,
    @Headers("idempotency-key") key?: string
  ) {
    return this.missions.remit(req.auth!, id, body, key, req.requestId);
  }

  @Post(":id/gps")
  @RequirePermission("recordGps")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  gps(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: RecordGpsDto) {
    return this.missions.recordGps(req.auth!, id, body, req.requestId);
  }
}
