import { MigrationInterface, QueryRunner } from "typeorm";
export declare class RefreshTokens1783900000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
