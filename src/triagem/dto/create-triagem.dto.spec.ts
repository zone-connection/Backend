import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTriagemDto } from './create-triagem.dto';

const base = {
  leadId: '11111111-1111-4111-8111-111111111111',
  texto: 'Cliente visitou o decorado.',
  origem: 'manual',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateTriagemDto, payload);
  return validate(dto);
}

describe('CreateTriagemDto tipo', () => {
  it('aceita visita, ligacao, reuniao e outro', async () => {
    for (const tipo of ['visita', 'ligacao', 'reuniao', 'outro']) {
      const errors = await errorsFor({ ...base, tipo });
      assert.equal(errors.length, 0, tipo);
    }
  });

  it('recusa um tipo fora da lista', async () => {
    const errors = await errorsFor({ ...base, tipo: 'bloqueio' });
    assert.equal(errors.some((error) => error.property === 'tipo'), true);
  });

  it('permite relato sem tipo', async () => {
    const errors = await errorsFor(base);
    assert.equal(errors.length, 0);
  });
});
