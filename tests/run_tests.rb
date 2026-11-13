#!/usr/bin/env ruby
# Automated verification script for Minh An B2B AI Agent
# Run with: ruby --disable-gems tests/run_tests.rb

require 'json'
require 'csv'
require 'net/http'

ROOT = File.expand_path('..', __dir__)

def assert(cond, msg)
  raise "ASSERTION FAILED: #{msg}" unless cond
end

puts "1. Checking sample JSON & CSV integrity..."
sample = JSON.parse(File.read(File.join(ROOT, 'data', 'sample_minh_an_data.json')))
assert(sample['requests'].length == 12, "Expected 12 sample requests, got #{sample['requests'].length}")
assert(sample['products'].length == 5, "Expected 5 sample products, got #{sample['products'].length}")
assert(sample['policies'].length == 3, "Expected 3 sample policies, got #{sample['policies'].length}")

req_csv = CSV.read(File.join(ROOT, 'data', 'csv', 'requests.csv'), headers: true, encoding: 'UTF-8')
assert(req_csv.length == 12, "Expected 12 CSV requests, got #{req_csv.length}")

puts "2. Checking JavaScript & HTML files exist..."
%w[app/index.html app/styles.css app/js/dataLoader.js app/js/agentTools.js app/js/agentSkills.js app/js/main.js docs/TASK1_PHAN_TICH_THIET_KE.md].each do |rel|
  path = File.join(ROOT, rel)
  assert(File.exist?(path) && File.size(path) > 100, "Missing or empty file: #{rel}")
end

puts "3. Checking server.rb syntax..."
syntax_ok = system("ruby --disable-gems -c #{File.join(ROOT, 'server.rb')} > /dev/null")
assert(syntax_ok, "server.rb has syntax errors")

puts "ALL STATIC & DATA CHECKS PASSED!"
