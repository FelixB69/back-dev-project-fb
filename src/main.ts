import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Activez CORS avant d'écouter
  app.enableCors({
    origin: [
      'https://dev-rh.felixberger.fr',
      'https://simulator-rh.felixberger.fr',
      'https://simulateur.felixberger.fr',
      'https://salaires.felixberger.fr',
      'http://localhost:3001',
      'http://localhost:3000',
    ], // Adresse du frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Méthodes autorisées
    credentials: true, // Si vous utilisez des cookies ou des sessions
  });

  // Écoute des requêtes
  await app.listen(3000);

  // Log des routes enregistrées (facultatif)
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
