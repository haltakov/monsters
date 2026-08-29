import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getWebOrigins } from './config/app-config';
import { json, urlencoded } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.enableCors({
    origin: getWebOrigins(),
    credentials: true,
  });
  // Better Auth must receive the untouched request body before Nest's parser.
  const auth = app.get(AuthService);
  app
    .getHttpAdapter()
    .getInstance()
    .all('/api/auth/*splat', await auth.nodeHandler());
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Required so the world runner can write its final checkpoint and release
  // the advisory lock when Coolify stops the container.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  console.log(`Monsters API ready at http://localhost:${port}/api`);
}
void bootstrap();
