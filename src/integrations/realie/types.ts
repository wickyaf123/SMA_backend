export interface RealiePropertyResponse {
  property: RealieProperty;
}

export interface RealieProperty {
  // Address & Parcel
  apn?: string;
  streetAddress?: string;
  fullAddress?: string;
  streetName?: string;
  streetType?: string;
  streetNumber?: string;
  unitNumber?: string;
  unitNumberStripped?: string;
  addressWithUnit?: string;
  county?: string;
  city?: string;
  zipCode?: string;
  state?: string;

  // Physical Characteristics
  buildingArea?: number;
  basementType?: string;
  wallType?: string;
  fireplaceCount?: number;
  hasFireplace?: boolean;
  floorType?: string;
  foundationType?: string;
  garageCount?: number;
  hasGarage?: boolean;
  garageType?: string;
  buildingCount?: number;
  stories?: number;
  totalBathrooms?: number;
  totalBedrooms?: number;
  hasPool?: boolean;
  poolType?: string;
  roofType?: string;
  roofStyle?: string;
  constructionType?: string;
  yearBuilt?: number;
  isResidential?: boolean;

  // Ownership
  ownerName?: string;
  ownerAddress?: string;
  ownerCity?: string;
  ownerState?: string;
  ownerZipCode?: string;
  ownerResidentialCount?: number;
  ownerCommercialCount?: number;
  ownerOriginCode?: string;
  ownerParcelCount?: number;

  // AVM & Tax
  totalAssessedValue?: number;
  assessedYear?: number;
  taxValue?: number;
  taxYear?: number;
  totalBuildingValue?: number;
  totalLandValue?: number;
  totalMarketValue?: number;
  marketValueYear?: number;
  taxRateCodeArea?: string;
  useCode?: string;
  modelValue?: number;
  modelValueMin?: number;
  modelValueMax?: number;
  assessments?: Array<{
    assessedYear: number;
    totalAssessedValue: number;
    totalBuildingValue: number;
    totalLandValue: number;
    totalMarketValue: number;
    marketValueYear: number;
    taxValue: number;
    taxYear: number;
  }>;

  // Mortgage & Lien
  totalLienCount?: number;
  totalLienBalance?: number;
  totalFinancingHistoryCount?: number;
  ltvCurrentEstimate?: number;
  ltvCurrentEstimateRange?: number;
  equityCurrentEstimateBalance?: number;
  equityCurrentEstimateRange?: number;
  ltvPurchase?: number;
  lenderName?: string;
  foreclosureCode?: string;

  // Transfer
  recordingDate?: string;
  transferDate?: string;
  transferDateISO?: string;
  transferPrice?: number;
  deedType?: string;
  documentNumber?: string;
  transfers?: Array<{
    transferDate: string;
    transferDateObject: string;
    transferPrice: number;
    grantee: string;
    grantor: string;
    recordingDate: string;
  }>;

  // Location
  fipsStateCode?: string;
  fipsCountyCode?: string;
  censusTract?: string;
  neighborhood?: string;
  longitude?: number;
  latitude?: number;
  siteId?: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };

  // Catch-all for additional fields
  [key: string]: any;
}

export interface RealieOwnerSearchResponse {
  properties: RealieProperty[];
  metadata: {
    limit: number;
    count: number;
  };
}
