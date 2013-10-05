#!/bin/sh
dir=`dirname $0`
mysql -u isucon isucon < $dir/alter.sql
