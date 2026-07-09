export interface EndpointSpec {
  method: string;
  uriPattern: string;
  successStatusCode: number;
  hasBody: boolean;
  successResponseJson: string;
  errorCases: ErrorCase[];
}

export interface ErrorCase {
  statusCode: number;
  message: string;
  situation: string;
}

export interface ResponseFieldRow {
  name: string;
  description: string;
  type: string;
  extra: string;
}
