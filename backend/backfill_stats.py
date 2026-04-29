import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from club.models import Transaction, ClubTable

def backfill_transactions():
    transactions = Transaction.objects.filter(table__isnull=True)
    tables = ClubTable.objects.all()
    count = 0
    
    for tx in transactions:
        for table in tables:
            if table.name in tx.description:
                tx.table = table
                tx.save()
                count += 1
                break
    
    print(f"Successfully backfilled {count} transactions.")

if __name__ == "__main__":
    backfill_transactions()
