import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Inject, UseGuards, Request, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IOAuthClientController } from './oauth-client.controller.interface.js';
import type { IOAuthClientService } from '../services/oauth-client.service.interface.js';
import { CreateOAuthClientDto } from '../dtos/create-oauth-client.dto.js';
import { UpdateOAuthClientDto } from '../dtos/update-oauth-client.dto.js';
import { OAuthClientResponseDto } from '../dtos/oauth-client-response.dto.js';
import { OAuthClientCreatedResponseDto } from '../dtos/oauth-client-created-response.dto.js';
import { OAuthClientInfoDto } from '../dtos/oauth-client-info.dto.js';
import { ChangeResponsibleUserDto } from '../dtos/change-responsible-user.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';
import { AdminJwtPayloadDto } from '../../admin-auth/dtos/admin-jwt-payload.dto.js';


interface RequestWithAdmin {
  admin: AdminJwtPayloadDto;
}


@ApiTags('Admin — Clientes OAuth')
@Controller('admin/clients')
export class OAuthClientController implements IOAuthClientController {
  constructor(
    @Inject('IOAuthClientService')
    private readonly oauthClientService: IOAuthClientService,
  ) {}

  @ApiOperation({ summary: 'Listar todos los clientes OAuth' })
  @ApiResponse({ status: 200, type: [OAuthClientResponseDto] })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Get()
  findAll(): Promise<OAuthClientResponseDto[]> {
    return this.oauthClientService.findAll();
  }

  @ApiOperation({ summary: 'Obtener cliente OAuth por ID' })
  @ApiResponse({ status: 200, type: OAuthClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<OAuthClientResponseDto> {
    return this.oauthClientService.findOne(id);
  }

  @ApiOperation({
    summary: 'Obtener nombre público del cliente OAuth',
    description: 'Endpoint público. Usado por el HTML del popup para mostrar el nombre de la app.',
  })
  @ApiResponse({ status: 200, type: OAuthClientInfoDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiQuery({ name: 'redirect_uri', required: false, description: 'Si se envía, la respuesta incluye redirectUriValid.' })
  @Get(':id/info')
  findInfo(
    @Param('id', ParseIntPipe) id: number,
    @Query('redirect_uri') redirectUri?: string,
  ): Promise<OAuthClientInfoDto> {
    return this.oauthClientService.findInfo(id, redirectUri);
  }

  @ApiOperation({ summary: 'Crear nuevo cliente OAuth' })
  @ApiResponse({ status: 201, type: OAuthClientCreatedResponseDto, description: 'El plainSecret solo es visible en esta respuesta.' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Post()
  create(@Request() req: RequestWithAdmin, @Body() dto: CreateOAuthClientDto): Promise<OAuthClientCreatedResponseDto> {
    return this.oauthClientService.create(dto, req.admin.sub);
  }

  @ApiOperation({ summary: 'Actualizar cliente OAuth' })
  @ApiResponse({ status: 200, type: OAuthClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOAuthClientDto,
  ): Promise<OAuthClientResponseDto> {
    return this.oauthClientService.update(id, dto);
  }

  @ApiOperation({ summary: 'Eliminar cliente OAuth' })
  @ApiResponse({ status: 200, description: 'Cliente eliminado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.oauthClientService.remove(id);
  }

  @ApiOperation({ summary: 'Regenerar client secret' })
  @ApiResponse({ status: 201, type: OAuthClientCreatedResponseDto, description: 'El plainSecret solo es visible en esta respuesta.' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Post(':id/regenerate-secret')
  regenerateSecret(@Request() req: RequestWithAdmin, @Param('id', ParseIntPipe) id: number): Promise<OAuthClientCreatedResponseDto> {
    return this.oauthClientService.regenerateSecret(id, req.admin.sub);
  }

  @ApiOperation({ summary: 'Enviar credenciales por email' })
  @ApiResponse({ status: 201, description: 'Email enviado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 400, description: 'Error al enviar el email' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Post(':id/send-credentials')
  sendCredentialsByEmail(
    @Request() req: RequestWithAdmin,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.oauthClientService.sendCredentialsByEmail(id, req.admin.sub);
  }

  @ApiOperation({ summary: 'Cambiar usuario responsable del cliente OAuth' })
  @ApiResponse({ status: 200, type: OAuthClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente o usuario no encontrado' })
  @ApiResponse({ status: 400, description: 'El usuario no está activo' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Patch(':id/responsible-user')
  changeResponsibleUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeResponsibleUserDto,
  ): Promise<OAuthClientResponseDto> {
    return this.oauthClientService.changeResponsibleUser(id, dto);
  }

  @ApiOperation({ summary: 'Suspender cliente OAuth', description: 'El cliente no podrá autenticar usuarios hasta que sea reactivado.' })
  @ApiResponse({ status: 200, type: OAuthClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Patch(':id/suspend')
  suspend(@Param('id', ParseIntPipe) id: number): Promise<OAuthClientResponseDto> {
    return this.oauthClientService.suspend(id);
  }

  @ApiOperation({ summary: 'Activar cliente OAuth suspendido' })
  @ApiResponse({ status: 200, type: OAuthClientResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiBearerAuth('admin-jwt')
  @UseGuards(AdminJwtGuard)
  @SkipThrottle()
  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number): Promise<OAuthClientResponseDto> {
    return this.oauthClientService.activate(id);
  }
}