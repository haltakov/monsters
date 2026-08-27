import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3100',
  });
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  console.log(`Monsters API ready at http://localhost:${port}/api`);
}
void bootstrap();
