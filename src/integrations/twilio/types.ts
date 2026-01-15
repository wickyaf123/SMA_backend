/**
 * Twilio Lookup API Types
 * Documentation: https://www.twilio.com/docs/lookup/api
 */

// ==================== Carrier Type ====================

export type CarrierType = 'mobile' | 'landline' | 'voip';

// ==================== Lookup Response ====================

export interface TwilioLookupResponse {
  caller_name: {
    caller_name: string | null;
    caller_type: string | null;
    error_code: number | null;
  } | null;
  carrier: {
    error_code: number | null;
    mobile_country_code: string | null;
    mobile_network_code: string | null;
    name: string | null;
    type: CarrierType | null;
  } | null;
  country_code: string;
  national_format: string;
  phone_number: string;
  add_ons: any | null;
  url: string;
}

// ==================== Error Types ====================

export interface TwilioError {
  code: number;
  message: string;
  more_info: string;
  status: number;
}

// ==================== Internal Types ====================

export interface PhoneValidationResult {
  phoneNumber: string;
  isValid: boolean;
  isMobile: boolean;
  isLandline: boolean;
  carrierType: CarrierType | null;
  carrierName: string | null;
  countryCode: string;
  nationalFormat: string;
  e164Format: string;
  validatedAt: Date;
}

// ==================== Status Mapping ====================

export const CARRIER_TYPE_TO_DB_STATUS: Record<CarrierType, string> = {
  'mobile': 'VALID_MOBILE',
  'landline': 'VALID_LANDLINE',
  'voip': 'VALID_LANDLINE', // Treat VoIP as landline for our purposes
};

