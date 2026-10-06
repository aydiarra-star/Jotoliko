import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "jotoliko-api",
      truth: "server skeleton — authentication and persistence are not yet enabled",
    };
  }
}
