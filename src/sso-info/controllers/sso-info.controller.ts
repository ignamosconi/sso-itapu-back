import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ISsoInfoController } from './sso-info.controller.interface.js';
import type { IDomainRoleService } from '../../domain-role/services/domain-role.service.interface.js';
import type { ISpecialtyService } from '../../specialty/services/specialty.service.interface.js';

@ApiTags('SSO — Información pública')
@Controller('sso/info')
export class SsoInfoController implements ISsoInfoController {
  constructor(
    @Inject('IDomainRoleService')
    private readonly domainRoleService: IDomainRoleService,
    @Inject('ISpecialtyService')
    private readonly specialtyService: ISpecialtyService,
  ) {}

  @ApiOperation({
    summary: 'Listar cargos institucionales disponibles',
    description:
      'Devuelve los valores posibles del campo `cargo` en la respuesta de `/sso/me`. ' +
      'Endpoint público — no requiere autenticación. ' +
      'Usalo para validar cargos en tu app o para mostrarlos en una UI de selección.',
  })
  @ApiResponse({ status: 200, schema: { example: ['Alumno', 'Profesor', 'Autoridad', 'No Docente'] } })
  @Get('domain-roles')
  async getDomainRoles(): Promise<string[]> {
    const roles = await this.domainRoleService.findAll();
    return roles.map(r => r.name);
  }

  @ApiOperation({
    summary: 'Listar especialidades disponibles',
    description:
      'Devuelve los valores posibles del campo `especialidad` en la respuesta de `/sso/me`. ' +
      'Endpoint público — no requiere autenticación.',
  })
  @ApiResponse({ status: 200, schema: { example: ['Programación', 'Mecánica', 'Química'] } })
  @Get('specialties')
  async getSpecialties(): Promise<string[]> {
    const specs = await this.specialtyService.findAll();
    return specs.map(s => s.name);
  }
}