<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">
A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.
</p>

<p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
<a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
<a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
<a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

---

## Salary Service

The **SalaryService** is responsible for managing salary data.  
It provides methods to **fetch, store, filter, and analyze** salary records from both the local database and an external API.

---

### Features

1. **Data Management**

   - `createSalary(dto)`: save a new salary entry.
   - `findAll() / findOne(id)`: retrieve salaries from the database.
   - `fetchAndSaveSalaries()`: fetch fresh salary data from [salaires.dev](https://salaires.dev/api/salaries) and insert only new records (based on date).

2. **Filtering**

   - `findByCity(city)`: get all salaries from a given city.
   - `findWithFilters({ city, rangeName, year })`: filter salaries using:
     - **City**
     - **Salary ranges** (low / medium / high bands).
     - **Experience years**.

3. **Statistics**

   - `calculateSalaryByYear()`: average, median, and percentages of salaries grouped by **experience ranges**.
   - `calculateSalaryRanges()`: salary distribution across defined **compensation ranges**.
   - `calculateSalaryByCity()`: salary distribution by **city**.
   - `getGlobalDatas()`: global statistics:
     - Total number of salaries.
     - Average & median compensation.
     - Lowest & highest salaries.
   - `calculateCoherenceScores()`: for each salary, calculates a **1–10 coherence score** based on:
     - Other salaries in the same location.
     - Other salaries with the same experience.
     - Salaries with both same location & experience.

4. **Math Utilities**
   - `calculateMedian`, `calculateAverage`, `calculatePercentage`: used for clean statistical results.

---

### Example Output

#### `getGlobalDatas()`

````json
{
  "totalSalaries": 1532,
  "averageCompensation": 46000,
  "medianCompensation": 44500,
  "lowestSalary": 22000,
  "highestSalary": 95000
}

---

# Score Service

This project is built on top of **NestJS** and **TensorFlow.js**.
It provides an API to **predict salaries** based on profile information and to evaluate how consistent a given salary is compared to others in the database.

---

## Purpose

The goal is to answer:

> **“Given my location and years of experience, am I paid fairly compared to others?”**

The service:
- Trains a small **neural network** using salary data.
- Predicts the **expected salary** for a new profile.
- Compares it with the **actual salary**.
- Generates **coherence and similarity scores**.
- Provides diagnostics, percentile rank, and statistics.
- Persists results so they can be retrieved later.

---

## How it works (simplified)

1. **Training**
   - Uses historical salary data (`Salary` table).
   - Input features:
     - **Location** (encoded as one-hot vectors).
     - **Years of experience (total_xp)**.
   - Output:
     - **Compensation (salary)**.
   - A small neural network learns the relationship between `(location, xp)` → `salary`.

2. **Prediction**
   - Given a profile, the model predicts the **expected salary**.

3. **Analysis**
   - Checks if the actual salary matches the expected one (**coherence**).
   - Places the salary in a percentile compared to all others (**position**).
   - Produces:
     - Salary gap analysis.
     - Diagnostic messages with icons.
     - Similarity histograms and averages by experience.

4. **Persistence**
   - Input profiles are stored (`Score`).
   - Full analyses (`ScoreResult`) can be retrieved later via their `id`.

---

## Example Output

```json
{
  "diagnostic": {
    "title": "Mostly consistent ✅",
    "icon": "✅",
    "description": "Your salary is generally aligned with your profile."
  },
  "estimatedGap": {
    "predicted": 45000,
    "actual": 47000,
    "difference": 2000,
    "percentage": 4.4,
    "comment": "You earn slightly more than estimated for your profile."
  },
  "salaryPosition": {
    "percentile": 78,
    "rankLabel": "top 25%",
    "comparison": "Among nearby profiles (same location & XP), you earn more than 68% of them."
  },
  "chartData": {
    "averageByXp": [
      { "xp": 2, "average": 35000 },
      { "xp": 5, "average": 42000 }
    ],
    "histogram": [
      { "range": "0.0–0.1", "count": 2 },
      { "range": "0.1–0.2", "count": 5 }
    ]
  }
}
````
