export type VerificationStatus =
  | 'OEM_VERIFIED'
  | 'OFFICIAL_GOVERNMENT'
  | 'OFFICIAL_MANUFACTURER'
  | 'SIMULATION_ONLY'
  | 'COMMUNITY_UNVERIFIED'
  | 'AI_INFERRED'
  | 'USER_SUPPLIED'
  | 'UNKNOWN';

export type RegionalMarket =
  | 'PHILIPPINES'
  | 'ASEAN'
  | 'JAPAN_DOMESTIC'
  | 'NORTH_AMERICA'
  | 'EUROPE'
  | 'GLOBAL';

export interface AutomotiveRecordProvenance {
  sourceName: string;
  sourceUrlOrRef: string;
  manufacturer: string;
  applicableVehicle: string;
  engineCode?: string;
  ecuPartNumber?: string;
  publicationOrRevision: string;
  verificationStatus: VerificationStatus;
  dateRetrieved: string;
  confidenceOrUncertainty: string;
  regionalApplicability: RegionalMarket[];
  licenseNotice?: string;
}
