export declare class StudentResponseDto {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    dni: number;
    birth_date: Date;
    account_status: string;
    domainRole: {
        id: number;
        name: string;
    };
    specialty: {
        id: number;
        name: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
