// salary.controller.ts
import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { CreateSalaryDto } from './create-salary.dto';
import { Salary } from './entities/salary.entity';

@Controller('salaries')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // ROUTES TO POST AND FETCH

  @Get('fetch')
  async fetchAndSave(): Promise<{ message: string }> {
    console.log('Route /salaries/fetch atteinte');
    await this.salaryService.fetchAndSaveSalaries();
    return {
      message:
        "Les données de l'API ont été insérées avec succès dans la base de données.",
    };
  }

  @Post()
  async create(@Body() createSalaryDto: CreateSalaryDto): Promise<Salary> {
    return this.salaryService.createSalary(createSalaryDto);
  }

  // ROUTES TO GET DATAS

  @Get()
  async findAll(): Promise<Salary[]> {
    return this.salaryService.findAll();
  }

  @Get('city')
  async getSalaryCity() {
    return await this.salaryService.calculateSalaryByCity();
  }

  @Get('ranges')
  async getSalaryRanges() {
    return await this.salaryService.calculateSalaryRanges();
  }

  @Get('years')
  async getSalaryYears() {
    return await this.salaryService.calculateSalaryByYear();
  }

  @Get('datas')
  async getGlobalDatas() {
    return await this.salaryService.getGlobalDatas();
  }

  @Get('filter')
  async getSalariesWithFilters(
    @Query('city') city?: string,
    @Query('rangeName') rangeName?: string,
    @Query('year') year?: string,
  ): Promise<Salary[]> {
    return this.salaryService.findWithFilters({ city, rangeName, year });
  }

  @Get('cities')
  async getCities(): Promise<string[]> {
    return await this.salaryService.findCities();
  }

  @Get('score')
  async getScore() {
    console.log('Route /salaries/score atteinte');
    return await this.salaryService.calculateCoherenceScores();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Salary> {
    return this.salaryService.findOne(id);
  }

  @Get('city/:city')
  async findByCity(@Param('city') city: string): Promise<Salary[]> {
    return this.salaryService.findByCity(city);
  }
}
