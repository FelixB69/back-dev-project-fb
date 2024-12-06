import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);

  const server = app.getHttpServer();
  const router = server._events.request._router;
  console.log('Registered routes:');
  console.log(
    router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path),
  );
}
bootstrap();
