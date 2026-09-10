pr #412: add createAvatarColumn to the shared table package

review thread on packages/table/src/index.ts

@tomas (reviewer):
> i'm not convinced this belongs in the table package at all. every column factory we add here couples table to another ui package (avatar now, badge next month). shouldn't column factories live next to the component they render, and table just export the ColumnDef type? i'd rather we settle that before merging this one.

state: no reply has been posted. the engineer has not weighed in. there is no decision recorded anywhere about where column factories live.
