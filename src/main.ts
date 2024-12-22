import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Activez CORS avant d'écouter
  app.enableCors({
    origin: 'http://localhost:4200', // Adresse du frontend Angular
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
