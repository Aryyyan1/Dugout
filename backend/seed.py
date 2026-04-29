import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from club.models import User, ClubTable

def seed():
    # Create Manager
    if not User.objects.filter(username='manager').exists():
        User.objects.create_superuser('manager', 'manager@example.com', 'admin123', is_manager=True)
        print("Manager user created.")

    # Create Member
    if not User.objects.filter(username='member').exists():
        User.objects.create_user('member', 'member@example.com', 'user123', is_manager=False)
        print("Member user created.")

    # Create Tables
    tables = [
        ('SNOOKER', 'Table 1'),
        ('SNOOKER', 'Table 2'),
        ('SNOOKER', 'Table 3'),
        ('POOL', 'Pool 1'),
        ('POOL', 'Pool 2'),
    ]

    for t_type, name in tables:
        if not ClubTable.objects.filter(name=name).exists():
            ClubTable.objects.create(name=name, table_type=t_type, hourly_rate=250 if t_type == 'SNOOKER' else 150)
            print(f"Table {name} created.")

if __name__ == '__main__':
    seed()
