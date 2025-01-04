// salary.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Salary } from './salary.entity';
import { Repository } from 'typeorm';
import { CreateSalaryDto } from './create-salary.dto';
import axios from 'axios';
import { ranges, years } from './salaryConstant';

interface SalaryAPIResponse {
  company: string;
  title: string;
  location: string;
  compensation: number;
  date: string;
  level: string;
  company_xp?: number;
  total_xp?: number;
  remote: {
    variant: string;
    dayCount?: number;
    base: string;
    location: string;
  };
  status?: string;
}

@Injectable()
export class SalaryService {
  constructor(
    @InjectRepository(Salary)
    private readonly salaryRepository: Repository<Salary>,
  ) {}

  // FIND DATAS IN DB

  findAll() {
    return this.salaryRepository.find();
  }

  findOne(id: string) {
    return this.salaryRepository.findOneBy({ id });
  }

  async findCities() {
    const cities = await this.salaryRepository
      .createQueryBuilder('salary')
      .select('DISTINCT salary.location', 'location')
      .getRawMany();

    return cities.map((city) => city.location);
  }

  async findByCity(city: string): Promise<Salary[]> {
    if (!city) {
      console.warn('Aucune ville spécifiée pour le filtre.');
      return [];
    }

    return this.salaryRepository.find({ where: { location: city } });
  }

  async findWithFilters(filters: {
    city?: string;
    rangeName?: string;
    year?: string;
  }): Promise<Salary[]> {
    const query = this.salaryRepository.createQueryBuilder('salary');

    // Filter by city
    if (filters.city) {
      query.andWhere('LOWER(salary.location) = LOWER(:city)', {
        city: filters.city,
      });
      console.log('City filter applied:', filters.city);
    }

    // Filter by range
    if (filters.rangeName) {
      const selectedRange = ranges.find(
        (range) => range.name === filters.rangeName,
      );

      if (!selectedRange) {
        console.warn('Tranche de salaire invalide spécifiée.');
        return [];
      }

      query.andWhere('salary.compensation >= :compMin', {
        compMin: selectedRange.min,
      });

      if (selectedRange.max !== Infinity) {
        query.andWhere('salary.compensation <= :compMax', {
          compMax: selectedRange.max,
        });
      }
      console.log('Range filter applied:', selectedRange);
    }

    // Filter by year (excluding N/A values)
    if (filters.year) {
      const selectedYear = years.find((year) => year.name === filters.year);

      if (!selectedYear) {
        console.warn('Année invalide spécifiée.');
        return [];
      }

      // Exclude NULL values and filter for the range
      query.andWhere(
        'salary.total_xp IS NOT NULL AND salary.total_xp >= :min',
        { min: selectedYear.min },
      );

      if (selectedYear.max !== Infinity) {
        query.andWhere('salary.total_xp <= :max', { max: selectedYear.max });
      }
      console.log('Year filter applied:', selectedYear);
    }

    // Execute the query
    const results = await query.getMany();

    return results;
  }

  async calculateSalaryRanges() {
    const salaries = await this.salaryRepository.find();
    const totalSalaries = salaries.length;

    if (totalSalaries === 0) {
      return [];
    }

    const salaryRanges = ranges.map((range) => {
      const count = salaries.filter(
        (s) => s.compensation >= range.min && s.compensation <= range.max,
      ).length;

      const percentage = ((count / totalSalaries) * 100).toFixed(2);

      return {
        name: range.name,
        count,
        percentage: parseFloat(percentage),
      };
    });

    return salaryRanges;
  }

  calculateMedian(salary) {
    if (!Array.isArray(salary) || salary.length === 0) {
      throw new Error('Le tableau des salaires doit être non vide.');
    }

    // Sort ascending datas
    const sortSalaries = salary.slice().sort((a, b) => a - b);

    const n = sortSalaries.length;
    const middle = Math.floor(n / 2);

    // Check if length number is even or odd
    if (n % 2 === 0) {
      // even
      return (sortSalaries[middle - 1] + sortSalaries[middle]) / 2;
    } else {
      // odd
      return sortSalaries[middle];
    }
  }

  async getGlobalDatas() {
    const salaries = await this.salaryRepository.find();
    const totalSalaries = salaries.length;
    const totalCompensation = salaries.reduce(
      (acc, curr) => acc + curr.compensation,
      0,
    );

    const averageCompensation = totalCompensation / totalSalaries;

    const medianCompensation = this.calculateMedian(
      salaries.map((s) => s.compensation),
    );

    return {
      totalSalaries,
      averageCompensation,
      medianCompensation,
    };
  }

  // POST DATA IN DB
  async createSalary(createSalaryDto: CreateSalaryDto) {
    const newSalary = this.salaryRepository.create({
      ...createSalaryDto,
      date: new Date(),
    });
    return await this.salaryRepository.save(newSalary);
  }

  async fetchAndSaveSalaries(): Promise<void> {
    const latestSalary = await this.salaryRepository
      .createQueryBuilder('salary')
      .orderBy('salary.date', 'DESC')
      .getOne();

    const latestDateInDb = latestSalary ? new Date(latestSalary.date) : null;

    console.log(
      '🚀 ~ Date la plus récente dans la base :',
      latestDateInDb?.toISOString() || 'Aucune donnée',
    );

    const response = await axios.get<SalaryAPIResponse[]>(
      'https://salaires.dev/api/salaries',
    );
    const salaries = response.data;

    const newSalaries = salaries.filter((salary) => {
      const salaryDate = new Date(salary.date);
      return !latestDateInDb || salaryDate > latestDateInDb;
    });

    console.log(
      `🚀 ~ Nombre de nouveaux enregistrements : ${newSalaries.length}`,
    );

    await Promise.all(
      newSalaries.map(async (salary) => {
        try {
          await this.salaryRepository.save({
            company: salary.company || 'N/A',
            title: salary.title || 'N/A',
            location: salary.location || 'Unknown',
            compensation: salary.compensation || 0,
            date: new Date(salary.date),
            level: salary.level || 'Unknown',
            company_xp: salary.company_xp || null,
            total_xp: salary.total_xp || null,
            remote: salary.remote
              ? {
                  variant: salary.remote.variant || 'none',
                  dayCount: salary.remote.dayCount || 0,
                  base: salary.remote.base || 'none',
                  location: salary.remote.location || 'none',
                }
              : null,
          });
        } catch (error) {
          console.error(
            `Erreur lors du traitement de l'enregistrement : ${salary.title || 'inconnu'}`,
            error,
          );
        }
      }),
    );
  }
}
