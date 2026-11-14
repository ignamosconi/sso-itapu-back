export interface ISsoInfoController {
  getDomainRoles(): Promise<string[]>;
  getSpecialties(): Promise<string[]>;
}