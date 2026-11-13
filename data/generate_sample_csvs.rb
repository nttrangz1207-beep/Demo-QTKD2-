require 'json'
require 'csv'
require 'fileutils'

data = JSON.parse(File.read(File.join(__dir__, 'sample_minh_an_data.json')))
out_dir = File.join(__dir__, 'csv')
FileUtils.mkdir_p(out_dir)

CSV.open(File.join(out_dir, 'requests.csv'), 'w', encoding: 'UTF-8') do |csv|
  csv << %w[request_id channel sales_rep customer_name raw_text test_category]
  data['requests'].each do |r|
    csv << [r['request_id'], r['channel'], r['sales_rep'], r['customer_name'], r['raw_text'], r['test_category']]
  end
end

CSV.open(File.join(out_dir, 'products.csv'), 'w', encoding: 'UTF-8') do |csv|
  csv << %w[sku name category unit_price available_stock lead_time_days]
  data['products'].each do |p|
    csv << [p['sku'], p['name'], p['category'], p['unit_price'], p['available_stock'], p['lead_time_days']]
  end
end

CSV.open(File.join(out_dir, 'policies.csv'), 'w', encoding: 'UTF-8') do |csv|
  csv << %w[policy_id role max_discount_pct approver description]
  data['policies'].each do |pol|
    csv << [pol['policy_id'], pol['role'], pol['max_discount_pct'], pol['approver'], pol['description']]
  end
end

puts "Generated CSV files in #{out_dir}"

