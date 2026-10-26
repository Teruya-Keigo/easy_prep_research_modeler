import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RelationDialog } from './RelationDialog';

describe('RelationDialog', () => {
  it('keeps the draft across parent rerenders and returns both relation layers', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <RelationDialog
        open
        sourceId="artifact-a"
        targetId="artifact-b"
        sourceName="要求"
        targetName="結果"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox'),
      'requires-revalidation-of',
    );
    await user.type(
      screen.getByPlaceholderText('この関係が表す内容を記録'),
      '再検証の根拠',
    );

    rerender(
      <RelationDialog
        open
        sourceId="artifact-a"
        targetId="artifact-b"
        sourceName="要求"
        targetName="結果"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveValue(
      'requires-revalidation-of',
    );
    expect(
      screen.getByPlaceholderText('この関係が表す内容を記録'),
    ).toHaveValue('再検証の根拠');

    await user.click(screen.getByTestId('confirm-relation'));
    expect(onConfirm).toHaveBeenCalledWith({
      prepType: 'input',
      semanticType: 'requires-revalidation-of',
      description: '再検証の根拠',
    });
  });

  it('rejects a synchronization relation to the same element', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RelationDialog
        open
        sourceId="artifact-a"
        targetId="artifact-a"
        sourceName="要求"
        targetName="要求"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByText('同期関係'));

    expect(
      screen.getByText('同一要素には同期関係を作成できません。'),
    ).toBeVisible();
    expect(screen.getByTestId('confirm-relation')).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
