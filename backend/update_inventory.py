import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from club.models import ClubTable

def update_tables():
    # Clear existing tables to reset inventory
    ClubTable.objects.all().delete()
    
    # 1 Snooker Table (Royal)
    ClubTable.objects.create(name='Royal', table_type='SNOOKER', hourly_rate=300.00)
    
    # 1 Snooker Table (Legend)
    ClubTable.objects.create(name='Legend', table_type='SNOOKER', hourly_rate=250.00)
    
    # 3 Pool Tables
    for i in range(1, 4):
        ClubTable.objects.create(name=f'Pool {i}', table_type='POOL', hourly_rate=150.00)
    
    print("Successfully updated tables inventory!")

if __name__ == '__main__':
    update_tables()
