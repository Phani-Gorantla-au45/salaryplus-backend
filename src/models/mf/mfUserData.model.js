import mongoose from "mongoose";
const { Schema } = mongoose;

/* ------------------------------------------------------------------ */
/*  KYC Status (from Cybrilla pre-verification)                         */
/* ------------------------------------------------------------------ */
const kycStatusSchema = new Schema({
  pan:               { type: String, default: null },
  name:              { type: String, default: null },
  dob:               { type: String, default: null },
  preVerificationId: { type: String, default: null },
  overallStatus:     { type: String, default: null },
  panStatus:         { type: String, default: null },
  panCode:           { type: String, default: null },
  nameStatus:        { type: String, default: null },
  nameCode:          { type: String, default: null },
  dobStatus:         { type: String, default: null },
  dobCode:           { type: String, default: null },
  kraStatus:         { type: String, default: null },
  kraCode:           { type: String, default: null },
  kraReason:         { type: String, default: null },
  lastCheckedAt:     { type: Date,   default: null },
  rawResponse:       { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Journey / Onboarding Progress                                       */
/* ------------------------------------------------------------------ */
const stageSchema = new Schema({
  status:      { type: String, default: "not_started" },
  completedAt: { type: Date,   default: null },
}, { _id: false });

const riskProfileSchema = new Schema({
  status:      { type: String,  default: "not_started" },
  score:       { type: Number,  default: null },
  category:    { type: String,  default: null },
  answers:     { type: Schema.Types.Mixed, default: null },
  completedAt: { type: Date,    default: null },
}, { _id: false });

const journeySchema = new Schema({
  riskProfile: { type: riskProfileSchema, default: () => ({}) },
  kycCheck:    { type: stageSchema,       default: () => ({}) },
  kycSubmit:   { type: stageSchema,       default: () => ({}) },
  account:     { type: stageSchema,       default: () => ({}) },
  canInvest:   { type: Boolean,           default: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Investor Profile                                                     */
/* ------------------------------------------------------------------ */
const investorProfileSchema = new Schema({
  fpInvestorProfileId: { type: String, default: null },
  type:             { type: String, default: null },
  taxStatus:        { type: String, default: null },
  name:             { type: String, default: null },
  dob:              { type: String, default: null },
  gender:           { type: String, default: null },
  occupation:       { type: String, default: null },
  pan:              { type: String, default: null },
  countryOfBirth:   { type: String, default: "IN" },
  placeOfBirth:     { type: String, default: "IN" },
  firstTaxResidency:{ type: Schema.Types.Mixed, default: null },
  sourceOfWealth:   { type: String, default: null },
  incomeSlab:       { type: String, default: null },
  pepDetails:       { type: String, default: null },
  signature:        { type: String, default: null },
  rawResponse:      { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Phone Number                                                         */
/* ------------------------------------------------------------------ */
const phoneSchema = new Schema({
  fpPhoneNumberId: { type: String, default: null },
  isd:             { type: String, default: "91" },
  number:          { type: String, default: null },
  belongsTo:       { type: String, default: null },
  rawResponse:     { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Email Address                                                        */
/* ------------------------------------------------------------------ */
const emailSchema = new Schema({
  fpEmailAddressId: { type: String, default: null },
  email:            { type: String, default: null },
  belongsTo:        { type: String, default: null },
  rawResponse:      { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Address                                                              */
/* ------------------------------------------------------------------ */
const addressSchema = new Schema({
  fpAddressId: { type: String, default: null },
  line1:       { type: String, default: null },
  line2:       { type: String, default: null },
  city:        { type: String, default: null },
  state:       { type: String, default: null },
  postalCode:  { type: String, default: null },
  country:     { type: String, default: "IN" },
  nature:      { type: String, default: "residential" },
  rawResponse: { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Bank Account                                                         */
/* ------------------------------------------------------------------ */
const bankAccountSchema = new Schema({
  fpBankAccountId:          { type: String, default: null },
  fpBankAccountOldId:       { type: Number, default: null },
  accountNumber:            { type: String, default: null },
  primaryAccountHolderName: { type: String, default: null },
  type:                     { type: String, default: null },
  ifscCode:                 { type: String, default: null },
  bankName:                 { type: String, default: null },
  branchName:               { type: String, default: null },
  branchCity:               { type: String, default: null },
  branchState:              { type: String, default: null },
  branchAddress:            { type: String, default: null },
  // Bank account verification
  verificationId:         { type: String, default: null },
  verificationStatus:     { type: String, default: null }, // pending | completed | failed
  verificationConfidence: { type: String, default: null }, // high | low | null
  verificationReason:     { type: String, default: null }, // digital_verification | expiry | digital_verification_failure
  rawResponse:            { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Nominee (single)                                                     */
/* ------------------------------------------------------------------ */
const nomineeAddressSchema = new Schema({
  line1:   { type: String, default: null },
  line2:   { type: String, default: null },
  city:    { type: String, default: null },
  pincode: { type: String, default: null },
  state:   { type: String, default: null },
  country: { type: String, default: "IN" },
}, { _id: false });

const nomineeSchema = new Schema({
  fpRelatedPartyId: { type: String, default: null },
  name:             { type: String, default: null },
  relationship:     { type: String, default: null },
  dob:              { type: String, default: null },
  pan:              { type: String, default: null },
  aadhaarNumber:    { type: String, default: null },
  emailAddress:     { type: String, default: null },
  phoneNumber:      { type: String, default: null },
  address:          { type: nomineeAddressSchema, default: () => ({}) },
  rawResponse:      { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Investment Account Folio Defaults                                    */
/* ------------------------------------------------------------------ */
const folioDefaultsSchema = new Schema({
  communication_email_address:    { type: String, default: null },
  communication_mobile_number:    { type: String, default: null },
  communication_address:          { type: String, default: null },
  payout_bank_account:            { type: String, default: null },
  nominee1:                       { type: String, default: null },
  nominee1_allocation_percentage: { type: Number, default: null },
  nominations_info_visibility:    { type: String, default: null },
}, { _id: false });

const investmentAccountSchema = new Schema({
  fpInvestmentAccountId:    { type: String, default: null },
  fpInvestmentAccountOldId: { type: Number, default: null }, // numeric id used by OMS APIs
  primaryInvestorPan:       { type: String, default: null },
  holdingPattern:           { type: String, default: "single" },
  folioDefaults:            { type: folioDefaultsSchema, default: () => ({}) },
  rawResponse:              { type: Schema.Types.Mixed, select: false },
}, { _id: false });

/* ------------------------------------------------------------------ */
/*  Root Schema                                                          */
/* ------------------------------------------------------------------ */
const mfUserDataSchema = new Schema(
  {
    uniqueId: { type: String, required: true, unique: true, index: true },

    kycStatus:         { type: kycStatusSchema,         default: () => ({}) },
    journey:           { type: journeySchema,            default: () => ({}) },
    investorProfile:   { type: investorProfileSchema,    default: () => ({}) },
    phone:             { type: phoneSchema,              default: () => ({}) },
    email:             { type: emailSchema,              default: () => ({}) },
    address:           { type: addressSchema,            default: () => ({}) },
    bankAccount:       { type: bankAccountSchema,        default: () => ({}) },
    nominee:           { type: nomineeSchema,            default: () => ({}) },
    investmentAccount: { type: investmentAccountSchema,  default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("MfUserData", mfUserDataSchema);
