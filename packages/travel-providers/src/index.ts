import type { ProviderCode, ProviderType } from './types';

// Types
export type {
  ProviderCode, ProviderType, CabinClass, PassengerType,
  ProviderCredentials, ProviderField, SupportedProvider,
  PassengerCount, FlightSearchParams, FlightOffer,
  PassengerInfo, PnrCreateParams, PnrResult, SegmentInfo,
  FormOfPayment, TicketIssueParams, IssuedTicket, VoidParams,
  RefundParams, RefundResult,
  HotelSearchParams, HotelOffer, HotelBookingParams, HotelReservation,
} from './types';

// Contracts
export type { BookingProvider } from './contracts/BookingProvider';
export type { FlightProvider }  from './contracts/FlightProvider';
export type { HotelProvider }   from './contracts/HotelProvider';

// Stub implementations
export { AmadeusProvider } from './providers/amadeus/AmadeusProvider';
export { GalileoProvider } from './providers/galileo/GalileoProvider';
export { SabreProvider }   from './providers/sabre/SabreProvider';

// Static provider registry — used by the web app's credentials API
export const SUPPORTED_PROVIDERS = [
  {
    code:         'amadeus'  as const,
    nameAr:       'أماديوس',
    nameEn:       'Amadeus',
    providerType: 'gds'      as const,
    requiredFields: [
      { key: 'clientId',     labelAr: 'معرف العميل',   labelEn: 'Client ID',     isSecret: false },
      { key: 'clientSecret', labelAr: 'سر العميل',     labelEn: 'Client Secret', isSecret: true  },
      { key: 'hostname',     labelAr: 'عنوان الخادم',  labelEn: 'Hostname',      isSecret: false },
    ],
  },
  {
    code:         'galileo'  as const,
    nameAr:       'جاليليو (ترافلبورت)',
    nameEn:       'Galileo (Travelport)',
    providerType: 'gds'      as const,
    requiredFields: [
      { key: 'targetBranch',    labelAr: 'فرع الهدف',        labelEn: 'Target Branch',    isSecret: false },
      { key: 'agentSine',       labelAr: 'توقيع الوكيل',      labelEn: 'Agent Sine',       isSecret: false },
      { key: 'terminalAddress', labelAr: 'عنوان الطرفية',     labelEn: 'Terminal Address', isSecret: false },
      { key: 'password',        labelAr: 'كلمة المرور',       labelEn: 'Password',         isSecret: true  },
    ],
  },
  {
    code:         'sabre'    as const,
    nameAr:       'سابر',
    nameEn:       'Sabre',
    providerType: 'gds'      as const,
    requiredFields: [
      { key: 'clientId',     labelAr: 'معرف العميل',  labelEn: 'Client ID',     isSecret: false },
      { key: 'clientSecret', labelAr: 'سر العميل',    labelEn: 'Client Secret', isSecret: true  },
      { key: 'pcc',          labelAr: 'رمز المكتب',   labelEn: 'PCC',           isSecret: false },
    ],
  },
  {
    code:         'hotelbeds' as const,
    nameAr:       'هوتل بدز',
    nameEn:       'Hotelbeds',
    providerType: 'hotel'     as const,
    requiredFields: [
      { key: 'apiKey',    labelAr: 'مفتاح API',  labelEn: 'API Key',    isSecret: false },
      { key: 'apiSecret', labelAr: 'سر API',     labelEn: 'API Secret', isSecret: true  },
    ],
  },
  {
    code:         'tbo'      as const,
    nameAr:       'تيبو',
    nameEn:       'TBO',
    providerType: 'both'     as const,
    requiredFields: [
      { key: 'username', labelAr: 'اسم المستخدم', labelEn: 'Username', isSecret: false },
      { key: 'password', labelAr: 'كلمة المرور',  labelEn: 'Password', isSecret: true  },
    ],
  },
] as const satisfies ReadonlyArray<{
  code:           ProviderCode;
  nameAr:         string;
  nameEn:         string;
  providerType:   ProviderType;
  requiredFields: ReadonlyArray<{ key: string; labelAr: string; labelEn: string; isSecret: boolean }>;
}>;

export type SupportedProviderEntry = typeof SUPPORTED_PROVIDERS[number];
