import { MigrationInterface, QueryRunner } from "typeorm";
export declare class CredentialTokensClientData1783921000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
