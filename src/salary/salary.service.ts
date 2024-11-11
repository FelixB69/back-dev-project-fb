// salary.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Salary } from './salary.entity';
import { Repository } from 'typeorm';
import { CreateSalaryDto } from './create-salary.dto';

@Injectable()
export class SalaryService {
  constructor(
    @InjectRepository(Salary)
    private readonly salaryRepository: Repository<Salary>,
  ) {}

  async createSalary(createSalaryDto: CreateSalaryDto) {
    const newSalary = this.salaryRepository.create({
      ...createSalaryDto,
      date: new Date(), // Date actuelle
    });
    return await this.salaryRepository.save(newSalary);
  }

  findAll() {
    return this.salaryRepository.find();
  }

  findOne(id: number) {
    return this.salaryRepository.findOneBy({ id });
  }
}
