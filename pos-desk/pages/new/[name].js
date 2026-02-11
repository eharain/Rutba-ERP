// pages/new/[name].js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { createNewEntity } from '../../lib/pos'
import { UtilProvider } from '../../context/UtilContext'

export default function Home() {
    const router = useRouter()
    const { name } = router.query
    const [errMessage, setErrorMessage] = useState('');

    
    useEffect(() => {
        if (!name) return

        const createEntity = async () => {
            try {
                setErrorMessage('');
                const entityName = name.replace('-edit', '');

                const { data, id, nameSinglar } = await createNewEntity(entityName);

                if (id) {
                    router.replace(`/${id}/${name}`)
                } else {
                    console.error("Failed to create", res)
                }
            } catch (err) {
                console.error("Error creating", err)
                setErrorMessage(err?.response?.data?.error?.message || ("Failed to create " + name))
            }
        }

        createEntity()
    }, [name, router])

    return (

        <div className="p-4">
            <p>Creating new {name}...</p>
            {errMessage && <p className="text-red-500">{errMessage}</p>}
        </div>

    )
}
