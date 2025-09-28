import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Salary } from './entities/salary.entity';
import { Repository } from 'typeorm';
import { CreateSalaryDto } from './create-salary.dto';
import axios from 'axios';
import { cities, ranges, years } from './salaryConstant';

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

  async calculateSalaryByYear() {
    return this.calculateStatistics(
      years,
      (salary, range) =>
        salary.total_xp >= range.min && salary.total_xp <= range.max,
    );
  }

  async calculateSalaryRanges() {
    return this.calculateStatistics(
      ranges,
      (salary, range) =>
        salary.compensation >= range.min && salary.compensation <= range.max,
    );
  }

  async calculateSalaryByCity() {
    return this.calculateStatistics(undefined, undefined, cities);
  }

  private async calculateStatistics(
    ranges?: { name: string; min: number; max: number }[],
    filterFn?: (salary: Salary, range: { min: number; max: number }) => boolean,
    cities?: string[],
  ) {
    const salaries = await this.salaryRepository.find();
    const totalSalaries = salaries.length;

    if (totalSalaries === 0) {
      return [];
    }

    if (cities) {
      return cities.map((city) => {
        const filteredByCity =
          city === 'Autre'
            ? salaries.filter((s) => !cities.includes(s.location))
            : salaries.filter((s) => s.location === city);
        const totalFilteredByCity = filteredByCity.length;

        if (totalFilteredByCity === 0) {
          return []; // Si aucune donnée pour cette ville, on retourne un tableau vide
        }

        const salariesValues = filteredByCity.map((s) => s.compensation);

        const count = filteredByCity.length;
        const percentage = this.calculatePercentage(count, totalSalaries);
        const average = this.calculateAverage(salariesValues);
        const median = this.calculateMedianSafe(salariesValues);

        return {
          name: city, // Le nom de la ville
          count,
          percentage,
          average,
          median,
        };
      });
    }

    if (ranges) {
      return ranges.map((range) => {
        // Filtrer les salaires selon la fonction passée
        const filteredSalaries = salaries.filter((s) => filterFn(s, range));
        const salariesValues = filteredSalaries.map((s) => s.compensation);

        const count = filteredSalaries.length;
        const percentage = this.calculatePercentage(count, totalSalaries);
        const average = this.calculateAverage(salariesValues);
        const median = this.calculateMedianSafe(salariesValues);

        return {
          name: range.name,
          count,
          percentage,
          average,
          median,
        };
      });
    }

    return 'No data';
  }

  private calculatePercentage(count: number, total: number): number {
    return parseFloat(((count / total) * 100).toFixed());
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return parseFloat((total / values.length).toFixed());
  }

  private calculateMedianSafe(values: number[]): number {
    if (values.length === 0) return 0;
    return this.calculateMedian(values);
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

    const averageCompensation = parseFloat(
      (totalCompensation / totalSalaries).toFixed(),
    );

    const medianCompensation = this.calculateMedian(
      salaries.map((s) => s.compensation),
    );

    const lowestSalary = Math.min(
      ...salaries
        .filter((s) => s.compensation > 20000)
        .map((s) => s.compensation),
    );
    const highestSalary = Math.max(...salaries.map((s) => s.compensation));

    return {
      totalSalaries,
      averageCompensation,
      medianCompensation,
      lowestSalary,
      highestSalary,
    };
  }

  async calculateCoherenceScores(): Promise<{ id: string; score: number }[]> {
    const salaries = await this.salaryRepository.find();

    if (!salaries.length) {
      throw new Error('Aucune donnée de salaire disponible.');
    }

    return salaries.map((salary) => {
      const sameLocation = salaries.filter(
        (s) => s.location === salary.location && s.compensation,
      );

      const sameExperience = salaries.filter(
        (s) => s.total_xp === salary.total_xp && s.compensation,
      );

      const sameLocationAndExperience = salaries.filter(
        (s) =>
          s.location === salary.location &&
          s.total_xp === salary.total_xp &&
          s.compensation,
      );

      // Moyennes pour les comparaisons
      const avgSameLocation = this.calculateAverage(
        sameLocation.map((s) => s.compensation),
      );
      const avgSameExperience = this.calculateAverage(
        sameExperience.map((s) => s.compensation),
      );
      const avgSameLocationAndExperience = this.calculateAverage(
        sameLocationAndExperience.map((s) => s.compensation),
      );

      // Calcul des scores individuels
      const locationScore =
        avgSameLocation > 0
          ? 1 -
            Math.abs(salary.compensation - avgSameLocation) / avgSameLocation
          : 0;

      const experienceScore =
        avgSameExperience > 0
          ? 1 -
            Math.abs(salary.compensation - avgSameExperience) /
              avgSameExperience
          : 0;

      const locationAndExperienceScore =
        avgSameLocationAndExperience > 0
          ? 1 -
            Math.abs(salary.compensation - avgSameLocationAndExperience) /
              avgSameLocationAndExperience
          : 0;

      // Pondération des scores
      const finalScore =
        0.5 * locationAndExperienceScore +
        0.25 * locationScore +
        0.25 * experienceScore;

      // Retourne la note normalisée entre 1 et 10

      return {
        id: salary.id,
        score: parseFloat(Math.max(1, Math.min(10, finalScore * 10)).toFixed()),
      };
    });
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
