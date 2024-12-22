// salary.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Salary } from './salary.entity';
import { Repository } from 'typeorm';
import { CreateSalaryDto } from './create-salary.dto';
import axios from 'axios';

interface SalaryAPIResponse {
  company: string;
  title: string;
  location: string;
  compensation: number;
  date: string; // La date dans l'API est probablement une chaîne
  level: string;
  company_xp?: number; // Les champs optionnels sont marqués avec `?`
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
  }): Promise<Salary[]> {
    const query = this.salaryRepository.createQueryBuilder('salary');

    // Filtrer par ville, si spécifié
    if (filters.city) {
      query.andWhere('salary.location = :city', { city: filters.city });
    }

    // Filtrer par tranche de salaire, si spécifié
    if (filters.rangeName) {
      const ranges = {
        under30k: { min: 0, max: 29999 },
        between30kAnd40k: { min: 30000, max: 39999 },
        between40kAnd50k: { min: 40000, max: 49999 },
        between50kAnd70k: { min: 50000, max: 69999 },
        between70kAnd100k: { min: 70000, max: 99999 },
        over100k: { min: 100000, max: Infinity },
      };

      const selectedRange = ranges[filters.rangeName];

      if (!selectedRange) {
        console.warn('Tranche de salaire invalide spécifiée.');
        return [];
      }

      query.andWhere('salary.compensation >= :min', { min: selectedRange.min });
      if (selectedRange.max !== Infinity) {
        query.andWhere('salary.compensation <= :max', {
          max: selectedRange.max,
        });
      }
    }

    return query.getMany();
  }

  async calculateSalaryRanges() {
    const salaries = await this.salaryRepository.find();
    const totalSalaries = salaries.length;

    if (totalSalaries === 0) {
      return [];
    }

    const ranges = [
      { name: 'under30k', min: 0, max: 29999 },
      { name: 'between30kAnd40k', min: 30000, max: 39999 },
      { name: 'between40kAnd50k', min: 40000, max: 49999 },
      { name: 'between50kAnd70k', min: 50000, max: 69999 },
      { name: 'between70kAnd100k', min: 70000, max: 99999 },
      { name: 'over100k', min: 100000, max: Infinity },
    ];

    const salaryRanges = ranges.map((range) => {
      const count = salaries.filter(
        (s) => s.compensation >= range.min && s.compensation <= range.max,
      ).length;

      const percentage = ((count / totalSalaries) * 100).toFixed(2);

      return {
        name: range.name,
        count,
        percentage: parseFloat(percentage), // Convertir en nombre pour éviter de manipuler des chaînes
      };
    });

    return salaryRanges;
  }

  // POST DATA IN DB
  async createSalary(createSalaryDto: CreateSalaryDto) {
    const newSalary = this.salaryRepository.create({
      ...createSalaryDto,
      date: new Date(), // Date actuelle
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
