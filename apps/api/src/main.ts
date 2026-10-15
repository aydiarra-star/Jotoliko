import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",").map((v) => v.trim()).filter(Boolean) ?? [] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidUnknownValues: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
