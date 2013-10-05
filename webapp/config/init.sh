#!/bin/sh
dir=`dirname $0`
mysql -u isucon isucon < $dir/alter.sql
count=`mysql -u isucon isucon < $dir/count.sql`
redis-cli set total_count $count
