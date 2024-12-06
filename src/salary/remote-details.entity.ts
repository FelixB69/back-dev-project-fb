import { Column } from 'typeorm';

export class RemoteDetails {
  @Column({ nullable: true })
  variant: string; // Ex: "partial"

  @Column({ type: 'int', nullable: true })
  dayCount: number; // Nombre de jours (Ex: 1)

  @Column({ nullable: true })
  base: string; // Ex: "week"

  @Column({ nullable: true })
  location: string; // Ex: "remote"
}
