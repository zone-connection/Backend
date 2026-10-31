import { IsIn } from 'class-validator';
import {
  DISPLAY_ADDRESS_VALUES,
  type DisplayAddress,
} from '../grupozap.constants';

export class UpdateGrupoZapDto {
  @IsIn(DISPLAY_ADDRESS_VALUES)
  displayAddress!: DisplayAddress;
}
