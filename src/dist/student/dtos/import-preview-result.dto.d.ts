export declare class ImportPreviewRowDto {
    rowNumber: number;
    valid: boolean;
    errors?: string[];
    data: Record<string, unknown>;
}
export declare class ImportPreviewResultDto {
    total: number;
    valid: number;
    invalid: number;
    rows: ImportPreviewRowDto[];
}
