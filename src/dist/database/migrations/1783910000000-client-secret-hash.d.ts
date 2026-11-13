import { MigrationInterface, QueryRunner } from "typeorm";
export declare class ClientSecretHash1783910000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
