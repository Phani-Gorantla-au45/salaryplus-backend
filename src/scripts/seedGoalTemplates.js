/**
 * Run once to seed goal templates:
 *   node src/scripts/seedGoalTemplates.js
 */
import mongoose from "mongoose";
import dotenv   from "dotenv";
dotenv.config();

import GoalTemplate from "../models/goals/goalTemplate.model.js";

const TEMPLATES = [
  {
    name:         "Child's Education",
    type:         "child_education",
    description:  "Plan for your child's higher education expenses.",
    icon:         "child_education",
    displayOrder: 1,
    fields: [
      { key: "child_age",      label: "Child's Current Age",         type: "number", min: 0,  max: 17,    unit: "years" },
      { key: "education_age",  label: "Age When Education Starts",   type: "number", min: 15, max: 25,    unit: "years", defaultValue: 18 },
      { key: "current_cost",   label: "Current Cost of Education",   type: "number", min: 0,              unit: "₹" },
    ],
    assumptions: { inflationRate: 8, returnRate: 12 },
  },
  {
    name:         "Child's Marriage",
    type:         "child_marriage",
    description:  "Start saving early for your child's wedding.",
    icon:         "child_marriage",
    displayOrder: 2,
    fields: [
      { key: "child_age",    label: "Child's Current Age",  type: "number", min: 0,  max: 25,  unit: "years" },
      { key: "marriage_age", label: "Expected Marriage Age",type: "number", min: 18, max: 35,  unit: "years", defaultValue: 25 },
      { key: "current_cost", label: "Estimated Wedding Cost (Today)", type: "number", min: 0,  unit: "₹" },
    ],
    assumptions: { inflationRate: 7, returnRate: 12 },
  },
  {
    name:         "Retirement",
    type:         "retirement",
    description:  "Build a corpus to sustain your lifestyle after retirement.",
    icon:         "retirement",
    displayOrder: 3,
    fields: [
      { key: "current_age",        label: "Your Current Age",            type: "number", min: 18,  max: 60,  unit: "years" },
      { key: "retirement_age",     label: "Target Retirement Age",       type: "number", min: 45,  max: 75,  unit: "years", defaultValue: 60 },
      { key: "monthly_expenses",   label: "Current Monthly Expenses",    type: "number", min: 0,             unit: "₹" },
    ],
    assumptions: {
      inflationRate: 7,
      returnRate: 12,
      postRetirementReturn: 7,
      postRetirementYears: 25,
    },
  },
  {
    name:         "Home Purchase",
    type:         "home_purchase",
    description:  "Save for the down payment on your dream home.",
    icon:         "home_purchase",
    displayOrder: 4,
    fields: [
      { key: "property_value",    label: "Property Value (Today)",     type: "number", min: 0,  unit: "₹" },
      { key: "down_payment_pct",  label: "Down Payment %",            type: "number", min: 5, max: 100, unit: "%", defaultValue: 20 },
      { key: "years_to_goal",     label: "Years to Purchase",         type: "number", min: 1, max: 30, unit: "years" },
    ],
    assumptions: { inflationRate: 6, returnRate: 12 },
  },
  {
    name:         "Emergency Fund",
    type:         "emergency_fund",
    description:  "Build a safety net to cover unexpected expenses.",
    icon:         "emergency_fund",
    displayOrder: 5,
    fields: [
      { key: "monthly_expenses",  label: "Monthly Expenses",         type: "number", min: 0, unit: "₹" },
      { key: "months_coverage",   label: "Months of Coverage",       type: "number", min: 1, max: 24, unit: "months", defaultValue: 6 },
    ],
    assumptions: { inflationRate: 0, returnRate: 7 },
  },
  {
    name:         "Vacation",
    type:         "vacation",
    description:  "Plan and save for your dream holiday.",
    icon:         "vacation",
    displayOrder: 6,
    fields: [
      { key: "current_cost",   label: "Estimated Trip Cost (Today)", type: "number", min: 0, unit: "₹" },
      { key: "years_to_goal",  label: "Years to Trip",               type: "number", min: 0, max: 10, unit: "years" },
    ],
    assumptions: { inflationRate: 5, returnRate: 10 },
  },
  {
    name:         "Custom Goal",
    type:         "custom",
    description:  "Save for any financial target you have in mind.",
    icon:         "custom",
    displayOrder: 7,
    fields: [
      { key: "current_cost",   label: "Target Amount (Today's Value)", type: "number", min: 0, unit: "₹" },
      { key: "years_to_goal",  label: "Years to Goal",                 type: "number", min: 1, max: 40, unit: "years" },
    ],
    assumptions: { inflationRate: 6, returnRate: 12 },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  for (const data of TEMPLATES) {
    await GoalTemplate.findOneAndUpdate(
      { type: data.type },
      { $setOnInsert: data },
      { upsert: true }
    );
    console.log(`✓ ${data.name}`);
  }

  console.log("Seed complete");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
