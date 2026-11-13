export declare class ImportStudentRowDto {
    first_name: string;
    last_name: string;
    dni: number;
    email: string;
    birth_date: string;
    domainRoleId: number;
    specialtyId: number;
}
export declare class ImportConfirmDto {
    rows: ImportStudentRowDto[];
}
export declare class ImportConfirmResultDto {
    imported: number;
    usernameCollisions: number;
}
