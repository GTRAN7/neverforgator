"""NeverForgator studio: rooms, stops inside rooms, scenes and pictures, shared palaces, usage limits.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-17

Adds tables `rooms` and `usage_counts`, and new nullable columns on `palaces` and `palace_stops`.
Campus-route palaces keep working unchanged: their stops still have location_id/concept/association.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('usage_counts',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('day', sa.String(length=10), nullable=False),
    sa.Column('action', sa.String(length=20), nullable=False),
    sa.Column('count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'day', 'action')
    )
    op.create_table('rooms',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('palace_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('file', sa.String(length=120), nullable=False),
    sa.Column('flipped', sa.Boolean(), server_default='0', nullable=False),
    sa.CheckConstraint("type IN ('panorama', 'photo', 'splat')", name='ck_room_type'),
    sa.ForeignKeyConstraint(['palace_id'], ['palaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('rooms', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_rooms_palace_id'), ['palace_id'], unique=False)

    with op.batch_alter_table('palace_stops', schema=None) as batch_op:
        batch_op.add_column(sa.Column('room_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('direction', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('point', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('view_from', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('label', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column('crop', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('auto', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('kind', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('key_terms', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('hook', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('image_prompt', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('image', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('weirdness', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('misses', sa.Integer(), server_default='0', nullable=False))
        batch_op.alter_column('location_id',
               existing_type=sa.INTEGER(),
               nullable=True)
        batch_op.alter_column('concept',
               existing_type=sa.VARCHAR(length=300),
               nullable=True)
        batch_op.alter_column('association',
               existing_type=sa.TEXT(),
               nullable=True)
        batch_op.create_index(batch_op.f('ix_palace_stops_room_id'), ['room_id'], unique=False)
        batch_op.create_foreign_key('fk_palace_stops_room_id', 'rooms', ['room_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('palaces', schema=None) as batch_op:
        batch_op.add_column(sa.Column('style', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('flavor', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('template', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('built_in', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('sample', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('copied_from', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('fill_report', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('next_review_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key('fk_palaces_copied_from', 'palaces', ['copied_from'], ['id'], ondelete='SET NULL')



def downgrade() -> None:
    with op.batch_alter_table('palaces', schema=None) as batch_op:
        batch_op.drop_constraint('fk_palaces_copied_from', type_='foreignkey')
        batch_op.drop_column('next_review_at')
        batch_op.drop_column('fill_report')
        batch_op.drop_column('copied_from')
        batch_op.drop_column('sample')
        batch_op.drop_column('built_in')
        batch_op.drop_column('template')
        batch_op.drop_column('flavor')
        batch_op.drop_column('style')

    with op.batch_alter_table('palace_stops', schema=None) as batch_op:
        batch_op.drop_constraint('fk_palace_stops_room_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_palace_stops_room_id'))
        batch_op.alter_column('association',
               existing_type=sa.TEXT(),
               nullable=False)
        batch_op.alter_column('concept',
               existing_type=sa.VARCHAR(length=300),
               nullable=False)
        batch_op.alter_column('location_id',
               existing_type=sa.INTEGER(),
               nullable=False)
        batch_op.drop_column('misses')
        batch_op.drop_column('weirdness')
        batch_op.drop_column('image')
        batch_op.drop_column('image_prompt')
        batch_op.drop_column('hook')
        batch_op.drop_column('key_terms')
        batch_op.drop_column('kind')
        batch_op.drop_column('auto')
        batch_op.drop_column('crop')
        batch_op.drop_column('label')
        batch_op.drop_column('view_from')
        batch_op.drop_column('point')
        batch_op.drop_column('direction')
        batch_op.drop_column('room_id')

    with op.batch_alter_table('rooms', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_rooms_palace_id'))

    op.drop_table('rooms')
    op.drop_table('usage_counts')
