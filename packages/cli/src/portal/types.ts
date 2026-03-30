export type PortalProcedureResult<T> =
  | {
      _tag: 'Left';
      left: {
        name?: string;
        message: string;
      };
    }
  | {
      _tag: 'Right';
      right: T;
    };

export type PortalClientConfig = {
  apiBaseUrl: string;
  apiKey: string;
  dappId?: string;
};

export type PortalUploadTarget = {
  uploadUrl: string;
  key: string;
  providerId: string;
  publicUrl: string;
};

export type PortalSourceKind = 'portal' | 'external';
